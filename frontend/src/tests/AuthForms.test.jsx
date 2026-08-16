import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Signup from "../components/Signup";
import ForgotPassword from "../components/ForgotPassword";
import ResetPassword from "../components/ResetPassword";
import ProtectedRoute from "../auth/ProtectedRoute";
import { AuthProvider } from "../auth/AuthContext";
import * as api from "../api/api";

vi.mock("../api/api");

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

function renderWithAuth(ui, { route = "/" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Nobody is signed in unless a test says otherwise.
  api.fetchCurrentUser.mockRejectedValue(Object.assign(new Error("no session"), { status: 401 }));
});

// ───────────────────────────────────────────────────────────────── signup ───

describe("Signup", () => {
  async function fillIn({ email, password, repeat }) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email/i), email);
    await user.type(screen.getByLabelText(/^password/i), password);
    await user.type(screen.getByLabelText(/repeat password/i), repeat);
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    return user;
  }

  it("creates the account and goes to the feed", async () => {
    api.signup.mockResolvedValue({ user: { id: 1, name: "Dana", role: "user" } });
    renderWithAuth(<Signup />);

    await fillIn({ email: "dana@example.com", password: "Password123!", repeat: "Password123!" });

    // The third argument is the display name, which this form does not collect —
    // the server derives one from the address.
    await waitFor(() =>
      expect(api.signup).toHaveBeenCalledWith("dana@example.com", "Password123!", undefined));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("does not send an address that is not an email", async () => {
    // Two guards agree here: the field is type="email", so the browser refuses
    // to submit at all, and the component checks the format itself for anything
    // that slips past. Either way nothing reaches the server.
    renderWithAuth(<Signup />);

    await fillIn({ email: "not-an-email", password: "Password123!", repeat: "Password123!" });

    expect(api.signup).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("trims the address before sending it", async () => {
    api.signup.mockResolvedValue({ user: { id: 1, name: "Dana", role: "user" } });
    renderWithAuth(<Signup />);

    await fillIn({ email: "  dana@example.com  ", password: "Password123!", repeat: "Password123!" });

    await waitFor(() =>
      expect(api.signup).toHaveBeenCalledWith("dana@example.com", "Password123!", undefined));
  });

  it("refuses when the two passwords differ", async () => {
    renderWithAuth(<Signup />);

    await fillIn({ email: "dana@example.com", password: "Password123!", repeat: "Password999!" });

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(api.signup).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the address is taken", async () => {
    api.signup.mockRejectedValue(new Error("Email already registered"));
    renderWithAuth(<Signup />);

    await fillIn({ email: "taken@example.com", password: "Password123!", repeat: "Password123!" });

    expect(await screen.findByText(/email already registered/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────── forgot password ───

describe("ForgotPassword", () => {
  it("shows the same neutral confirmation for any address", async () => {
    // The server deliberately answers identically whether or not the address is
    // registered. If this screen said "we sent you a link" only for real
    // accounts, the form would become a way to find out who has one.
    api.requestPasswordReset.mockResolvedValue({ message: "ok" });
    const user = userEvent.setup();
    renderWithAuth(<ForgotPassword />);

    await user.type(screen.getByLabelText(/email/i), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument();
  });

  it("trims the address before sending it", async () => {
    api.requestPasswordReset.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithAuth(<ForgotPassword />);

    await user.type(screen.getByLabelText(/email/i), "  dana@example.com  ");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith("dana@example.com"));
  });

  it("keeps the submit button disabled until something is typed", async () => {
    renderWithAuth(<ForgotPassword />);

    expect(screen.getByRole("button", { name: /send reset link/i })).toBeDisabled();
  });

  it("reports a failure instead of claiming the mail was sent", async () => {
    api.requestPasswordReset.mockRejectedValue(new Error("Cannot reach the server"));
    const user = userEvent.setup();
    renderWithAuth(<ForgotPassword />);

    await user.type(screen.getByLabelText(/email/i), "dana@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/reset link is on its way/i)).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────── reset password ───

describe("ResetPassword", () => {
  const withToken = (token) =>
    renderWithAuth(
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>,
      { route: `/reset-password${token ? `?token=${token}` : ""}` }
    );

  async function submit(password, repeat) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^new password/i), password);
    await user.type(screen.getByLabelText(/repeat new password/i), repeat);
    await user.click(screen.getByRole("button", { name: /change password/i }));
  }

  it("explains itself when the link has no token", () => {
    withToken(null);

    expect(screen.getByText(/reset link is incomplete/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument();
  });

  it("sends the token from the URL with the new password", async () => {
    api.resetPassword.mockResolvedValue({ message: "done" });
    withToken("abc123");

    await submit("Password123!", "Password123!");

    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith("abc123", "Password123!"));
    expect(await screen.findByText(/your password has been changed/i)).toBeInTheDocument();
  });

  it("refuses a password shorter than the server's minimum, before sending it", async () => {
    withToken("abc123");

    await submit("short", "short");

    expect(await screen.findByText(/^password must be at least 8 characters$/i)).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("refuses when the two passwords differ", async () => {
    withToken("abc123");

    await submit("Password123!", "Password999!");

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the token has expired", async () => {
    api.resetPassword.mockRejectedValue(new Error("This reset link has expired"));
    withToken("stale");

    await submit("Password123!", "Password123!");

    expect(await screen.findByText(/reset link has expired/i)).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────── ProtectedRoute ──

describe("ProtectedRoute", () => {
  const Guarded = () => (
    <Routes>
      <Route path="/login" element={<p>Sign-in page</p>} />
      <Route
        path="/new-post"
        element={<ProtectedRoute><p>Composer</p></ProtectedRoute>}
      />
    </Routes>
  );

  it("waits for the session check instead of bouncing on first paint", async () => {
    // The bug this prevents: on a refresh the cookie is valid but unconfirmed,
    // so redirecting immediately threw a signed-in user out to /login.
    let resolveMe;
    api.fetchCurrentUser.mockReturnValue(new Promise((r) => { resolveMe = r; }));

    renderWithAuth(<Guarded />, { route: "/new-post" });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Sign-in page")).not.toBeInTheDocument();

    resolveMe({ user: { id: 1, name: "Dana", role: "user" } });
    expect(await screen.findByText("Composer")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the sign-in page", async () => {
    renderWithAuth(<Guarded />, { route: "/new-post" });

    expect(await screen.findByText("Sign-in page")).toBeInTheDocument();
    expect(screen.queryByText("Composer")).not.toBeInTheDocument();
  });

  it("lets a signed-in user through", async () => {
    api.fetchCurrentUser.mockResolvedValue({ user: { id: 1, name: "Dana", role: "user" } });

    renderWithAuth(<Guarded />, { route: "/new-post" });

    expect(await screen.findByText("Composer")).toBeInTheDocument();
  });
});
