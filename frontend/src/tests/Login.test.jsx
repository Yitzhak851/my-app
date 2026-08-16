import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "../components/Login";
import { AuthProvider } from "../auth/AuthContext";
import * as api from "../api/api";

// This file used to contain three tests that rendered the form and asserted
// `expect(getByLabelText(/email/i)).toBeTruthy()`. `getBy*` already throws when
// the element is missing, so the expectation could never fail — the tests
// proved the component rendered *something* and nothing about what it does.
// These test the behaviour instead.

vi.mock("../api/api");

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

function show() {
  return render(
    <MemoryRouter>
      <AuthProvider><Login /></AuthProvider>
    </MemoryRouter>
  );
}

async function signIn(email, password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole("button", { name: /^login$/i }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.fetchCurrentUser.mockRejectedValue(Object.assign(new Error("no session"), { status: 401 }));
});

describe("Login", () => {
  it("signs in and goes to the feed", async () => {
    api.login.mockResolvedValue({ user: { id: 1, name: "Dana", role: "user" } });
    show();

    await signIn("dana@example.com", "Password123!");

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("dana@example.com", "Password123!"));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("trims the address before sending it", async () => {
    api.login.mockResolvedValue({ user: { id: 1, name: "Dana", role: "user" } });
    show();

    await signIn("  dana@example.com  ", "Password123!");

    await waitFor(() =>
      expect(api.login).toHaveBeenCalledWith("dana@example.com", "Password123!"));
  });

  it("shows the server's message and stays put when the password is wrong", async () => {
    api.login.mockRejectedValue(Object.assign(
      new Error("Invalid email or password"), { status: 401 }));
    show();

    await signIn("dana@example.com", "wrong");

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("explains a network failure rather than failing silently", async () => {
    api.login.mockRejectedValue(new Error("Cannot reach the server. Is the backend running?"));
    show();

    await signIn("dana@example.com", "Password123!");

    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument();
  });

  it("clears a previous error when the form is submitted again", async () => {
    api.login.mockRejectedValueOnce(new Error("Invalid email or password"));
    api.login.mockResolvedValueOnce({ user: { id: 1, name: "Dana", role: "user" } });
    show();

    await signIn("dana@example.com", "wrong");
    await screen.findByText(/invalid email or password/i);

    await userEvent.setup().click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() =>
      expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument());
  });

  it("never puts the password in the DOM as readable text", async () => {
    show();

    const password = screen.getByLabelText(/^password/i);
    expect(password).toHaveAttribute("type", "password");
  });

  it("offers the way out for someone who has forgotten their password", () => {
    show();

    expect(screen.getByRole("link", { name: /forgot your password/i }))
      .toHaveAttribute("href", "/forgot-password");
  });

  it("offers a way to create an account", () => {
    show();

    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute("href", "/signup");
  });
});
