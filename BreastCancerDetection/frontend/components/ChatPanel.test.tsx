import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as api from "@/lib/api";

import { ChatPanel } from "./ChatPanel";

jest.mock("@/lib/api");

test("streams the assistant reply token by token", async () => {
  (api.streamChat as jest.Mock).mockImplementation(async function* () {
    yield { type: "tool", name: "classify_histopath_image" };
    yield { type: "token", text: "Likely " };
    yield { type: "token", text: "benign." };
    yield { type: "done" };
  });

  render(<ChatPanel imageBase64="abc" />);
  await userEvent.type(screen.getByLabelText(/ask the assistant/i), "What is it?");
  await userEvent.click(screen.getByRole("button", { name: /send/i }));

  await waitFor(() => expect(screen.getByText(/Likely benign\./)).toBeInTheDocument());
  expect(screen.getByText("What is it?")).toBeInTheDocument();
});
