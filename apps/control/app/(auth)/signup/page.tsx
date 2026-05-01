import { redirect } from "next/navigation";

import { AuthForm } from "../AuthForm";
import { signUpAction, type AuthResult } from "../actions";
import { getCurrentUser } from "../../../lib/auth/workspace";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  async function action(
    _state: AuthResult | null,
    formData: FormData,
  ): Promise<AuthResult | null> {
    "use server";
    return await signUpAction(formData);
  }

  return <AuthForm mode="signup" action={action} />;
}
