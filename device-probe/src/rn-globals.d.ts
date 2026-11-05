/** Present where the React Native typecheck does not include Node globals. */
declare const process: {
  memoryUsage?: () => { heapUsed: number; rss: number };
};
