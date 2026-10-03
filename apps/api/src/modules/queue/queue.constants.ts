export const QUEUES = {
  NOTIFICATIONS: "notifications",
  EXPIRY: "expiry",
  ROLLUPS: "rollups",
  MAINTENANCE: "maintenance",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
