import { render, screen } from "@testing-library/react";

import { Disclaimer } from "./Disclaimer";

test("shows the not-a-diagnostic-device disclaimer", () => {
  render(<Disclaimer />);
  expect(screen.getByText(/not a diagnostic device/i)).toBeInTheDocument();
  expect(screen.getByText(/No patient data is stored/i)).toBeInTheDocument();
});
