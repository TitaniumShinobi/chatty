/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import { fetchMe, loginWithEmail, type User } from "./lib/auth";

jest.mock("./lib/auth", () => ({
  fetchMe: jest.fn(async () => null),
  loginWithGoogle: jest.fn(),
  loginWithMicrosoft: jest.fn(),
  loginWithApple: jest.fn(),
  loginWithGithub: jest.fn(),
  loginWithEmail: jest.fn(),
  signupWithEmail: jest.fn(),
}));

describe("unauthenticated App surface", () => {
  const fetchMeMock = fetchMe as jest.MockedFunction<typeof fetchMe>;
  const loginWithEmailMock = loginWithEmail as jest.MockedFunction<typeof loginWithEmail>;

  function userWithVvaultSession(reason: string, ready = false): User {
    return {
      sub: "devon_1710000000000",
      id: "devon_1710000000000",
      email: "devon@example.com",
      name: "Devon",
      authSource: "shared",
      vvaultReady: ready,
      vvaultSession: {
        ready,
        authSource: "shared",
        reason: ready ? null : reason,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, "", "/");
    localStorage.clear();
    fetchMeMock.mockResolvedValue(null);
    loginWithEmailMock.mockResolvedValue({
      ok: false,
      error: "Login failed",
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders auth only and no assistant UI before session", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/zen assistant/i)).toBeNull();
    expect(screen.queryByLabelText(/open zen assistant/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/ask before you enter/i)).toBeNull();
    expect(screen.queryByText(/customizable construct/i)).toBeNull();
    expect(screen.queryByText(/who is zen/i)).toBeNull();
  });

  it("treats a shared-auth-degraded user as signed in and redirects into the app shell", async () => {
    fetchMeMock.mockResolvedValue(userWithVvaultSession("shared_auth_unavailable"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
    expect(
      screen.queryByText(
        "Chatty could not reach the shared auth/VVAULT bridge for this session.",
      ),
    ).toBeNull();
  });

  it("treats a VVAULT-unreachable user as signed in and redirects into the app shell", async () => {
    fetchMeMock.mockResolvedValue(userWithVvaultSession("vvault_unreachable"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
    expect(
      screen.queryByText("Chatty could not reach VVAULT for this shared session."),
    ).toBeNull();
  });

  it("keeps a degraded email login as a real Chatty session and redirects into the app shell", async () => {
    loginWithEmailMock.mockResolvedValue({
      ok: true,
      user: userWithVvaultSession("vvault_bridge_unavailable"),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "devon@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
    expect(
      screen.queryByText(
        "Chatty could not reach the shared auth/VVAULT bridge for this session.",
      ),
    ).toBeNull();
    expect(localStorage.getItem("auth:lastEmail")).toBe("devon@example.com");
  });

  it("still treats a VVAULT-ready user as signed in", async () => {
    fetchMeMock.mockResolvedValue(userWithVvaultSession("", true));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
    });
  });

  it("opens signup mode when shared auth returns missing consent", async () => {
    window.history.pushState({}, "", "/?authModal=signup&reason=missing_consent");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        /Google sign-in succeeded\. Finish account setup and accept the Chatty and VVAULT legal terms to continue\./i,
      ),
    ).toBeInTheDocument();
  });
});
