// Starts the AI Video Agent Studio: a local web app to make videos in a window.
//   npm run studio            (then open http://localhost:4321)
// On Windows the installer's windowless launcher opens it in an app window.
import { startStudioServer } from "../src/studio/server.js";

const port = Number(process.env.STUDIO_PORT) || 4321;

startStudioServer({ port })
  .then(() => console.log(`AI Video Agent Studio is running at http://localhost:${port}`))
  .catch((err) => {
    console.error(`Could not start the Studio: ${(err as Error).message}`);
    process.exitCode = 1;
  });
