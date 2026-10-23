import './style.css';
import { startApp } from './ui/app.ts';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) startApp(app);
