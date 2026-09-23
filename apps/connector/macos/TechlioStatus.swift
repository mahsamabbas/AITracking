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
private let healthURL = URL(string: "http://127.0.0.1:9477/health")!
private let logPath = NSString(string: "~/.techlio-connector/connector.log").expandingTildeInPath

private enum ConnectorState {
    case notRunning
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
        var request = URLRequest(url: healthURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 3)
        request.httpMethod = "GET"
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            var next: ConnectorState = .notRunning
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
        case .notRunning:
            title = "Techlio Connector — Not running"
            detail.append("The background service is stopped")
        }
        menu.addItem(disabled(title))
        detail.forEach { menu.addItem(disabled($0)) }
        if let version { menu.addItem(disabled("Version \(version)")) }
        menu.addItem(.separator())

        switch state {
        case .notActivated:
            menu.addItem(action("Activate this Mac…", #selector(openMyConnectors)))
        case .collecting:
            menu.addItem(action("Pause collection", #selector(pause)))
        case .paused:
            menu.addItem(action("Resume collection", #selector(resume)))
        case .notRunning:
            menu.addItem(action("Start connector", #selector(restartService)))
        }
        menu.addItem(action("Open Techlio dashboard", #selector(openDashboard)))
        menu.addItem(action("Show log", #selector(openLog)))
        if case .notRunning = state {} else {
            menu.addItem(action("Restart connector", #selector(restartService)))
        }
        menu.addItem(.separator())
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
        var request = URLRequest(url: URL(string: "http://127.0.0.1:9477\(path)")!)
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

    @objc private func restartService() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        task.arguments = ["kickstart", "-k", "gui/\(getuid())/\(serviceLabel)"]
        try? task.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.refresh() }
    }

    /// Only the icon goes away (until next sign-in); collection keeps running.
    @objc private func hideIcon() {
        NSApp.terminate(nil)
    }
}

let args = CommandLine.arguments
let dashboard = args.firstIndex(of: "--dashboard").flatMap { i in i + 1 < args.count ? args[i + 1] : nil }
    ?? "https://tracking-app-api-t9yd.vercel.app"

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // menu bar only, never in the Dock
let controller = StatusController(dashboard: dashboard)
app.run()
