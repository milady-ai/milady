import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoticeToast } from "../components/NoticeToast";

describe("NoticeToast", () => {
  it("renders nothing when no notice is active", () => {
    const { container } = render(<NoticeToast notice={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders an error notice with status semantics", () => {
    render(<NoticeToast notice={{ tone: "error", text: "delete failed" }} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("delete failed");
    expect(status).toHaveClass("text-rose-100");
  });
});
