export const liveSessionExpireScheduleConfig = {
  interval: 1000 * 60 * 1, // 1 minutes
  intervalCronEx: '*/1 * * * *',
  maxInactiveTime: 1000 * 60 * 1, // 1 minutes
};
