import type { Meta, StoryObj } from "@storybook/react";
import { StatCard, StatusBadge, StatusDot } from "../components/ui/status-badge";

const meta = {
  title: "UI/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: "select",
      options: ["success", "warning", "danger", "muted"],
    },
    withDot: { control: "boolean" },
    label: { control: "text" },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: { label: "Active", tone: "success" },
};

export const Warning: Story = {
  args: { label: "Pending", tone: "warning" },
};

export const Danger: Story = {
  args: { label: "Error", tone: "danger" },
};

export const Muted: Story = {
  args: { label: "Offline", tone: "muted" },
};

export const WithDot: Story = {
  args: { label: "Connected", tone: "success", withDot: true },
};

export const AllTones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge label="Active" tone="success" withDot />
      <StatusBadge label="Pending" tone="warning" withDot />
      <StatusBadge label="Error" tone="danger" withDot />
      <StatusBadge label="Offline" tone="muted" withDot />
    </div>
  ),
};

export const Dots: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <StatusDot status="success" />
      <StatusDot status="connected" />
      <StatusDot status="error" />
      <StatusDot status="failed" />
      <StatusDot status="pending" />
    </div>
  ),
};

export const Stat: Story = {
  render: () => (
    <div className="flex gap-2">
      <StatCard label="Users" value="1,234" />
      <StatCard label="Revenue" value="$5.6k" accent />
      <StatCard label="Uptime" value="99.9%" />
    </div>
  ),
};
