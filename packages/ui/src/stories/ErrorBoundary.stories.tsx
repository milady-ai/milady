import type { Meta, StoryObj } from "@storybook/react";
import { ErrorBoundary } from "../components/ui/error-boundary";

const meta: Meta<typeof ErrorBoundary> = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

const SafeChild = () => <div className="p-4 border rounded-md">This content renders normally.</div>;

const BrokenChild = () => {
  throw new Error("Something broke while rendering this component!");
};

export const Normal: Story = {
  render: () => (
    <ErrorBoundary>
      <SafeChild />
    </ErrorBoundary>
  ),
};

export const WithError: Story = {
  render: () => (
    <ErrorBoundary>
      <BrokenChild />
    </ErrorBoundary>
  ),
};

export const CustomFallback: Story = {
  render: () => (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="p-6 border border-yellow-500 bg-yellow-50 rounded-md text-center">
          <p className="font-semibold text-yellow-800 mb-2">Custom Error UI</p>
          <p className="text-sm text-yellow-700 mb-4">{error.message}</p>
          <button
            type="button"
            className="px-3 py-1 text-sm border rounded-md"
            onClick={reset}
          >
            Reset
          </button>
        </div>
      )}
    >
      <BrokenChild />
    </ErrorBoundary>
  ),
};

export const CustomLabels: Story = {
  render: () => (
    <ErrorBoundary errorLabel="Oops!" retryLabel="Retry">
      <BrokenChild />
    </ErrorBoundary>
  ),
};
