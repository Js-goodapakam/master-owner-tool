import 'dotenv/config'; import { app } from './app.js'; const port=Number(process.env.API_PORT||4000); app.listen(port,()=>console.log(`FRIDAY Master Owner API listening on ${port}`));
