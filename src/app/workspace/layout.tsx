import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, currentUser } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import Link from "next/link";
import "./workspace.css";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) redirect("/login");
  let email: string | null | undefined;
  try {
    email = await currentUser(database(), token);
  } catch {
    return (
      <main className="app-main">
        <h1>Workspace unavailable</h1>
        <p>We could not connect to the database. Please retry shortly.</p>
      </main>
    );
  }
  if (!email) redirect("/login");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <div className="app-content">
        <header className="app-topbar">
          <Link className="brand" href="/workspace">
            <span className="brand-mark" aria-hidden="true">
              fi
            </span>
            Factory Interviews
          </Link>
          <nav className="workspace-nav" aria-label="Main navigation">
            <Link href="/workspace">All sessions</Link>
            <Link href="/">
              Product overview <span aria-hidden="true">↗</span>
            </Link>
          </nav>
          <div className="account-menu">
            <span className="local-indicator">
              <span aria-hidden="true" />
              {email}
            </span>
            <form action="/api/auth/logout" method="post">
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main id="workspace-main" className="app-main">
          {children}
        </main>
        <footer className="app-footer">
          Made for better conversations · AI suggestions are yours to review.
        </footer>
      </div>
    </div>
  );
}
