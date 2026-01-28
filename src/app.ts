import express from 'express';
import notifyRouter from './router/notify.route';
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/notify', notifyRouter);

export default app;
