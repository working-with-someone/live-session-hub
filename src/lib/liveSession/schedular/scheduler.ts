import { ScheduledTask } from 'node-cron';

class LiveSessionScheduler {
  task: ScheduledTask;

  constructor(task: ScheduledTask) {
    this.task = task;
  }

  startSchedule() {
    if (this.task.getStatus() == 'stopped') {
      this.task.start();
    }
  }

  stopSchedule() {
    if (this.task.getStatus() != 'stopped') {
      this.task.stop();
    }
  }
}

export default LiveSessionScheduler;
