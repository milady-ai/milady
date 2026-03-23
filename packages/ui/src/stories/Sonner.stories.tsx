import type { Meta, StoryObj } from "@storybook/react";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { Toaster } from "../components/ui/sonner";

const meta = {
  title: "UI/Sonner",
  component: Toaster,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="dark">
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div>
      <Toaster />
      <button
        type="button"
        className="rounded-md border border-input bg-bg px-4 py-2 text-sm"
        onClick={() => toast("This is a toast notification")}
      >
        Show Toast
      </button>
    </div>
  ),
};

export const WithVariants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Toaster />
      <button
        type="button"
        className="rounded-md border border-input bg-bg px-4 py-2 text-sm"
        onClick={() => toast.success("Success!")}
      >
        Success
      </button>
      <button
        type="button"
        className="rounded-md border border-input bg-bg px-4 py-2 text-sm"
        onClick={() => toast.error("Error!")}
      >
        Error
      </button>
      <button
        type="button"
        className="rounded-md border border-input bg-bg px-4 py-2 text-sm"
        onClick={() => toast.info("Info")}
      >
        Info
      </button>
    </div>
  ),
};
