import * as Yup from "yup";
import { FIELD_LIMITS, validatePortalPassword, passwordErrorMessage } from "@/lib/validation";
import { ORG_ASSIGNABLE_ROLES } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export const createUserInitialValues = {
  displayName: "",
  email: "",
  password: "",
  role: "developer" as Role,
};

export const createUserSchema = Yup.object({
  displayName: Yup.string()
    .trim()
    .required("Display name is required.")
    .max(FIELD_LIMITS.displayName, `Use at most ${FIELD_LIMITS.displayName} characters.`),
  email: Yup.string()
    .trim()
    .email("Enter a valid email address.")
    .required("Email is required.")
    .max(FIELD_LIMITS.email, `Use at most ${FIELD_LIMITS.email} characters.`),
  password: Yup.string()
    .required("Temporary password is required.")
    .max(FIELD_LIMITS.password, `Use at most ${FIELD_LIMITS.password} characters.`)
    .test("portal-password", function (value) {
      if (!value) return true;
      const err = validatePortalPassword(value);
      if (err) return this.createError({ message: passwordErrorMessage(err) });
      return true;
    }),
  role: Yup.mixed<Role>()
    .oneOf([...ORG_ASSIGNABLE_ROLES], "Choose a valid role.")
    .required(),
});

export const changePasswordSchema = Yup.object({
  currentPassword: Yup.string().required("Enter your current password.").max(FIELD_LIMITS.password),
  newPassword: Yup.string()
    .required("Enter a new password.")
    .max(FIELD_LIMITS.password)
    .test("portal-password", function (value) {
      if (!value) return true;
      const err = validatePortalPassword(value);
      if (err) return this.createError({ message: passwordErrorMessage(err) });
      return true;
    }),
  confirmPassword: Yup.string()
    .required("Confirm your new password.")
    .oneOf([Yup.ref("newPassword")], "Passwords must match."),
});
