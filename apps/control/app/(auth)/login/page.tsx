import { redirect } from "next/navigation";

import { AuthForm } from "../AuthForm";
import { signInAction, type AuthResult } from "../actions";
import { getCurrentUser } from "../../../lib/auth/workspace";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  // Already signed in? Bounce them home so they don't see the login screen.
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { next } = await searchParams;

  async function action(
    _state: AuthResult | null,
    formData: FormData,
  ): Promise<AuthResult | null> {
    "use server";
    return await signInAction(formData);
  }

  return <AuthForm mode="login" action={action} next={next} />;
}
