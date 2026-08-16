import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NewPost from "../components/NewPost";
import * as api from "../api/api";

vi.mock("../api/api");

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

// Quill is a third-party editor with its own tests. What matters here is the
// contract this component has with it: read the plain text, replace the text,
// paste HTML. A fake makes those observable — and keeps the suite from
// depending on a real contenteditable inside jsdom.
const editor = {
  text: "",
  html: "",
  handlers: {},
};

vi.mock("quill/dist/quill.snow.css", () => ({}));
vi.mock("quill", () => ({
  default: class FakeQuill {
    constructor() {
      this.root = { get innerHTML() { return editor.html; } };
      this.clipboard = {
        dangerouslyPasteHTML: (html) => { editor.html = html; editor.text = html.replace(/<[^>]+>/g, ""); },
      };
    }
    on(event, handler) { editor.handlers[event] = handler; }
    getText() { return editor.text; }
    setText(value) { editor.text = value; editor.html = `<p>${value}</p>`; }
  },
}));

function typeInEditor(text) {
  editor.text = text;
  editor.html = `<p>${text}</p>`;
  editor.handlers["text-change"]?.();
}

const show = () => render(<MemoryRouter><NewPost /></MemoryRouter>);

// Puts a file on the input regardless of its `accept` attribute.
function chooseFile(input, file) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

const imageFile = (name = "cat.png", type = "image/png", size = 1000) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

beforeEach(() => {
  vi.clearAllMocks();
  editor.text = "";
  editor.html = "";
  editor.handlers = {};
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

// ─────────────────────────────────────────────────────────── publishing ─────

describe("NewPost — publishing", () => {
  it("refuses to publish without a title or a body", async () => {
    show();

    await userEvent.setup().click(screen.getByRole("button", { name: /publish/i }));

    expect(await screen.findByText(/title and body are required/i)).toBeInTheDocument();
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it("refuses a title made only of spaces", async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByPlaceholderText(/enter post title/i), "   ");
    typeInEditor("some body");

    await user.click(screen.getByRole("button", { name: /publish/i }));

    expect(await screen.findByText(/title and body are required/i)).toBeInTheDocument();
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it("publishes the trimmed title with the editor's HTML and goes to the feed", async () => {
    api.createPost.mockResolvedValue({ post: { id: 1 } });
    const user = userEvent.setup();
    show();

    await user.type(screen.getByPlaceholderText(/enter post title/i), "  My title  ");
    typeInEditor("Hello world");
    await user.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() => expect(api.createPost).toHaveBeenCalledWith({
      title: "My title",
      body: "<p>Hello world</p>",
      image_url: null,
    }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("shows the server's reason and stays on the page when publishing fails", async () => {
    api.createPost.mockRejectedValue(new Error("Could not create the post"));
    const user = userEvent.setup();
    show();

    await user.type(screen.getByPlaceholderText(/enter post title/i), "Title");
    typeInEditor("Body");
    await user.click(screen.getByRole("button", { name: /publish/i }));

    expect(await screen.findByText(/could not create the post/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────── images ────

describe("NewPost — the image", () => {
  it("uploads the file first and sends the returned URL with the post", async () => {
    // Upload first, so a failed upload cannot leave a post pointing at an
    // image that was never stored.
    api.uploadImage.mockResolvedValue({ url: "/uploads/abc.png" });
    api.createPost.mockResolvedValue({ post: { id: 1 } });
    const user = userEvent.setup();
    show();

    await user.upload(screen.getByTestId("image-input"), imageFile());
    await user.type(screen.getByPlaceholderText(/enter post title/i), "With a picture");
    typeInEditor("Body");
    await user.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() => expect(api.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: "/uploads/abc.png" })));
    expect(api.uploadImage).toHaveBeenCalledBefore(api.createPost);
  });

  it("does not create the post when the upload fails", async () => {
    api.uploadImage.mockRejectedValue(new Error("That file is not an image"));
    const user = userEvent.setup();
    show();

    await user.upload(screen.getByTestId("image-input"), imageFile());
    await user.type(screen.getByPlaceholderText(/enter post title/i), "Title");
    typeInEditor("Body");
    await user.click(screen.getByRole("button", { name: /publish/i }));

    expect(await screen.findByText(/that file is not an image/i)).toBeInTheDocument();
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it("rejects a file type the server would reject anyway", async () => {
    show();

    // Bypasses the file picker's own `accept` filter, which is what a renamed
    // file or a scripted upload does. The component's own check is what is
    // being tested — an SVG is the one that matters, because an SVG can carry
    // script and the server rejects it for that reason.
    chooseFile(screen.getByTestId("image-input"), imageFile("evil.svg", "image/svg+xml"));

    expect(await screen.findByText(/png, jpeg, gif or webp/i)).toBeInTheDocument();
    expect(screen.queryByAltText(/preview/i)).not.toBeInTheDocument();
  });

  it("rejects a file larger than the server's limit before uploading it", async () => {
    const user = userEvent.setup();
    show();

    await user.upload(screen.getByTestId("image-input"), imageFile("big.png", "image/png", 6 * 1024 * 1024));

    expect(await screen.findByText(/larger than 5 mb/i)).toBeInTheDocument();
  });

  it("previews the chosen image and lets it be removed again", async () => {
    const user = userEvent.setup();
    show();

    await user.upload(screen.getByTestId("image-input"), imageFile());
    expect(await screen.findByAltText(/preview of the image/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove the selected image/i }));

    await waitFor(() =>
      expect(screen.queryByAltText(/preview of the image/i)).not.toBeInTheDocument());
    // The object URL holds the file in memory until it is revoked.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});

// ─────────────────────────────────────────────────────── the writing help ───

describe("NewPost — writing help", () => {
  it("applies spelling fixes and lists what changed", async () => {
    api.autocorrectText.mockResolvedValue({
      corrected: "the cat", changes: [{ from: "teh", to: "the" }],
    });
    const user = userEvent.setup();
    show();
    typeInEditor("teh cat");

    await user.click(screen.getByRole("button", { name: /fix spelling/i }));

    expect(await screen.findByText(/fixed 1: teh → the/i)).toBeInTheDocument();
    expect(editor.text).toBe("the cat");
  });

  it("says so when there is nothing to fix, without touching the text", async () => {
    api.autocorrectText.mockResolvedValue({ corrected: "all good", changes: [] });
    const user = userEvent.setup();
    show();
    typeInEditor("all good");

    await user.click(screen.getByRole("button", { name: /fix spelling/i }));

    expect(await screen.findByText(/no spelling suggestions/i)).toBeInTheDocument();
  });

  it("does not call the server for an empty editor", async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: /fix spelling/i }));

    expect(api.autocorrectText).not.toHaveBeenCalled();
  });

  it("keeps working when the suggestion service is down", async () => {
    api.autocorrectText.mockRejectedValue(new Error("Suggestions unavailable"));
    const user = userEvent.setup();
    show();
    typeInEditor("teh cat");

    await user.click(screen.getByRole("button", { name: /fix spelling/i }));

    expect(await screen.findByText(/unavailable right now/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeEnabled();
  });

  it("inserts a generated draft and fills an empty title", async () => {
    api.generatePostDraft.mockResolvedValue({ title: "A generated title", body: "<p>Draft body</p>" });
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: /suggest a draft/i }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/enter post title/i)).toHaveValue("A generated title"));
    expect(editor.html).toBe("<p>Draft body</p>");
  });

  it("does not overwrite a title the person already wrote", async () => {
    api.generatePostDraft.mockResolvedValue({ title: "A generated title", body: "<p>Draft</p>" });
    const user = userEvent.setup();
    show();

    await user.type(screen.getByPlaceholderText(/enter post title/i), "Mine");
    await user.click(screen.getByRole("button", { name: /suggest a draft/i }));

    await waitFor(() => expect(api.generatePostDraft).toHaveBeenCalled());
    expect(screen.getByPlaceholderText(/enter post title/i)).toHaveValue("Mine");
  });

  it("warns about a hostile tone but still allows publishing", async () => {
    // The rule for this feature: it advises, it does not censor.
    api.analyzeText.mockResolvedValue({ score: -0.9, is_toxic: true, matches: ["idiot"] });
    const user = userEvent.setup();
    show();
    typeInEditor("you are an idiot");

    await user.click(screen.getByRole("button", { name: /check tone/i }));

    expect(await screen.findByText(/reads as hostile \(idiot\)/i)).toBeInTheDocument();
    expect(screen.getByText(/you can still publish it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeEnabled();
  });

  it("confirms a tone check that passed", async () => {
    api.analyzeText.mockResolvedValue({ score: 0.4, is_toxic: false, matches: [] });
    const user = userEvent.setup();
    show();
    typeInEditor("this is a nice post");

    await user.click(screen.getByRole("button", { name: /check tone/i }));

    expect(await screen.findByText(/tone check passed/i)).toBeInTheDocument();
  });

  it("sends the title along with the body to be scored", async () => {
    // A hostile title with a mild body would otherwise pass.
    api.analyzeText.mockResolvedValue({ is_toxic: false, matches: [] });
    const user = userEvent.setup();
    show();

    await user.type(screen.getByPlaceholderText(/enter post title/i), "Nasty headline");
    typeInEditor("mild body");
    await user.click(screen.getByRole("button", { name: /check tone/i }));

    await waitFor(() =>
      expect(api.analyzeText).toHaveBeenCalledWith("Nasty headline mild body"));
  });
});
