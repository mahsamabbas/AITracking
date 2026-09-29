// Techlio Connector menu-bar status (macOS).
//
// A menu-bar-only app (LSUIElement: no Dock icon, no window) started at sign-in
// by /Library/LaunchAgents/com.techlio.connector.menubar.plist. It only reads
// the local connector's /health and calls its /pause and /resume endpoints;
// all collection happens in the background service (com.techlio.connector).
//
// Build: scripts/pack-connector.mjs (swiftc, universal).
import AppKit

private let serviceLabel = "com.techlio.connector"
/// This user's connector. Each macOS user has their own port, recorded by the
/// connector in ~/.techlio-connector/port, so two people signed in to one Mac
/// never see or pause each other's connector.
private func connectorBase() -> String {
    let file = NSString(string: "~/.techlio-connector/port").expandingTildeInPath
    if let text = try? String(contentsOfFile: file, encoding: .utf8),
       let port = Int(text.trimmingCharacters(in: .whitespacesAndNewlines)), port > 0 {
        return "http://127.0.0.1:\(port)"
    }
    return "http://127.0.0.1:9477"
}
private let logPath = NSString(string: "~/.techlio-connector/connector.log").expandingTildeInPath
/// Written by the connector when the employee stops it; removed when it starts.
private let stoppedMarker = NSString(string: "~/.techlio-connector/stopped-at").expandingTildeInPath

private enum ConnectorState {
    case notRunning
    case stopped
    case notActivated
    case paused(name: String?)
    case collecting(name: String?, queued: Int)
}

final class StatusController: NSObject, NSMenuDelegate {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let dashboard: String
    private var state: ConnectorState = .notRunning
    private var version: String?

    init(dashboard: String) {
        self.dashboard = dashboard
        super.init()
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        render()
        refresh()
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
    }

    // MARK: - Health polling

    private func refresh() {
        var request = URLRequest(url: URL(string: "\(connectorBase())/health")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 3)
        request.httpMethod = "GET"
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            var next: ConnectorState =
                FileManager.default.fileExists(atPath: stoppedMarker) ? .stopped : .notRunning
            var version: String?
            if let data, (response as? HTTPURLResponse)?.statusCode == 200,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                version = json["version"] as? String
                let name = json["displayName"] as? String
                if json["paired"] as? Bool != true {
                    next = .notActivated
                } else if json["paused"] as? Bool == true {
                    next = .paused(name: name)
                } else {
                    next = .collecting(name: name, queued: json["queueDepth"] as? Int ?? 0)
                }
            }
            DispatchQueue.main.async {
                self?.state = next
                self?.version = version
                self?.render()
            }
        }.resume()
    }

    // MARK: - Icon

    private func render() {
        let symbol: String
        let tooltip: String
        switch state {
        case .collecting:
            symbol = "waveform.path.ecg"
            tooltip = "Techlio connector: collecting AI agent activity"
        case .paused:
            symbol = "pause.circle"
            tooltip = "Techlio connector: collection paused"
        case .notActivated:
            symbol = "exclamationmark.circle"
            tooltip = "Techlio connector: running, not activated"
        case .stopped:
            symbol = "stop.circle"
            tooltip = "Techlio connector: stopped by you"
        case .notRunning:
            symbol = "xmark.circle"
            tooltip = "Techlio connector: not running"
        }
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: tooltip)
        image?.isTemplate = true // follows light/dark menu bar
        item.button?.image = image
        item.button?.toolTip = tooltip
    }

    // MARK: - Menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let title: String
        var detail: [String] = []
        switch state {
        case .collecting(let name, let queued):
            title = "Techlio Connector — Running"
            detail.append("Collecting AI agent activity" + (name.map { " for \($0)" } ?? ""))
            if queued > 0 { detail.append("\(queued) event(s) waiting to upload") }
        case .paused(let name):
            title = "Techlio Connector — Paused"
            detail.append("Collection paused" + (name.map { " for \($0)" } ?? ""))
        case .notActivated:
            title = "Techlio Connector — Running"
            detail.append("Not activated on this Mac yet")
        case .stopped:
            title = "Techlio Connector — Stopped"
            detail.append("Stopped by you; nothing is recorded")
        case .notRunning:
            title = "Techlio Connector — Not running"
            detail.append("The background service is not running")
        }
        menu.addItem(disabled(title))
        detail.forEach { menu.addItem(disabled($0)) }
        if let version { menu.addItem(disabled("Version \(version)")) }
        menu.addItem(.separator())

        switch state {
        case .notActivated:
            menu.addItem(action("Activate this Mac…", #selector(openMyConnectors)))
            menu.addItem(action("Stop connector…", #selector(stopConnector)))
        case .collecting:
            menu.addItem(action("Pause collection", #selector(pause)))
            menu.addItem(action("Stop connector…", #selector(stopConnector)))
        case .paused:
            menu.addItem(action("Resume collection", #selector(resume)))
            menu.addItem(action("Stop connector…", #selector(stopConnector)))
        case .stopped, .notRunning:
            menu.addItem(action("Start connector", #selector(startConnector)))
        }
        menu.addItem(.separator())
        menu.addItem(action("Open Techlio dashboard", #selector(openDashboard)))
        menu.addItem(action("Show log", #selector(openLog)))
        menu.addItem(.separator())
        menu.addItem(action("Uninstall connector…", #selector(uninstallConnector)))
        menu.addItem(action("Hide menu bar icon", #selector(hideIcon)))
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func action(_ title: String, _ selector: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        item.target = self
        return item
    }

    // MARK: - Actions

    private func post(_ path: String) {
        var request = URLRequest(url: URL(string: "\(connectorBase())\(path)")!)
        request.httpMethod = "POST"
        URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
            DispatchQueue.main.async { self?.refresh() }
        }.resume()
    }

    @objc private func pause() { post("/pause") }
    @objc private func resume() { post("/resume") }

    @objc private func openDashboard() { open(dashboard) }
    @objc private func openMyConnectors() { open("\(dashboard)/my-connectors") }

    private func open(_ url: String) {
        if let url = URL(string: url) { NSWorkspace.shared.open(url) }
    }

    @objc private func openLog() {
        NSWorkspace.shared.open(URL(fileURLWithPath: logPath))
    }

    /// Stops collection until the employee starts it again or signs in again.
    /// The connector records the stop as a gap the dashboard shows, then exits;
    /// launchd does not restart a clean exit.
    @objc private func stopConnector() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Stop the Techlio connector?"
        alert.informativeText = "AI agent activity on this Mac will not be recorded until you start it again or sign in again. The stop is shown on the dashboard as a period when collection was off."
        alert.addButton(withTitle: "Stop")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        post("/stop")
    }

    @discardableResult
    private func launchctl(_ args: [String]) -> Int32 {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        task.arguments = args
        try? task.run()
        task.waitUntilExit()
        return task.terminationStatus
    }

    @objc private func startConnector() {
        let domain = "gui/\(getuid())"
        if launchctl(["kickstart", "\(domain)/\(serviceLabel)"]) != 0 {
            // Not loaded (e.g. booted out): load the installed agent, then start it.
            let system = "/Library/LaunchAgents/\(serviceLabel).plist"
            let user = NSString(string: "~/Library/LaunchAgents/\(serviceLabel).plist").expandingTildeInPath
            let plist = FileManager.default.fileExists(atPath: system) ? system : user
            launchctl(["bootstrap", domain, plist])
            launchctl(["kickstart", "\(domain)/\(serviceLabel)"])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.refresh() }
    }

    /// Removes the connector from this Mac (service, menu bar icon, AI tool
    /// hooks, program) so a new version can be installed. The .pkg install
    /// lives in /Library, so macOS asks for an administrator password.
    @objc private func uninstallConnector() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Uninstall the Techlio connector?"
        alert.informativeText = "This removes the background service, this menu bar icon, the AI tool hooks, and the program from this Mac. Afterwards you can install the new version.\n\n“Remove everything” also deletes this Mac's activation and any events not yet uploaded — you will activate the new connector again."
        alert.addButton(withTitle: "Uninstall")
        alert.addButton(withTitle: "Remove everything")
        alert.addButton(withTitle: "Cancel")
        let choice = alert.runModal()
        if choice == .alertThirdButtonReturn { return }
        let purge = choice == .alertSecondButtonReturn ? " --purge" : ""
        let systemScript = "/Library/Application Support/Techlio/Connector/uninstall.sh"
        let task = Process()
        if FileManager.default.fileExists(atPath: systemScript) {
            task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            task.arguments = ["-e", "do shell script quoted form of \"\(systemScript)\" & \"\(purge)\" with administrator privileges"]
        } else {
            task.executableURL = URL(fileURLWithPath: NSString(string: "~/.techlio/connector/techlio-connector").expandingTildeInPath)
            task.arguments = purge.isEmpty ? ["--uninstall"] : ["--uninstall", "--purge"]
        }
        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            let failed = NSAlert()
            failed.messageText = "Could not start the uninstaller"
            failed.informativeText = error.localizedDescription
            failed.runModal()
            return
        }
        if task.terminationStatus == 0 {
            NSApp.terminate(nil)
        }
    }

    /// Only the icon goes away (until next sign-in); collection keeps running.
    @objc private func hideIcon() {
        NSApp.terminate(nil)
    }
}

let args = CommandLine.arguments
let dashboard = args.firstIndex(of: "--dashboard").flatMap { i in i + 1 < args.count ? args[i + 1] : nil }
    ?? "https://ai-tracking-bhgg.vercel.app"

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // menu bar only, never in the Dock
let controller = StatusController(dashboard: dashboard)
app.run()
