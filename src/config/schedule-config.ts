export const liveSessionExpireScheduleConfig = {
  interval: 1000 * 60 * 1, // 1 minutes
  intervalCronEx: '*/1 * * * *',
  // 2분, media server에 push가 이루어지지 않았을 때 donePublish noti가 발생하는 시간이 1분이기 때문에 이보다 같거나 낮으면 안된다.
  maxInactiveTime: 1000 * 60 * 2, // 2 minutes
};

export const liveSessionOpenScheduleConfig = {
  interval: 1000 * 1,
  intervalCronEx: '* * * * * *',
};

export const liveSessionBreakScheduleConfig = {
  interval: 1000 * 1,
  intervalCronEx: '* * * * * *',
};
