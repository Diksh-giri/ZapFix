export interface AuthAdminError {
  code?: string;
  message: string;
}

/** Supabase may use either code across GoTrue versions for an existing account. */
export function isExistingAuthUserError(error: AuthAdminError): boolean {
  return error.code === "email_exists" || error.code === "user_already_exists";
}
