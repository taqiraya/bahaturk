// cPanel/Passenger startup file. CommonJS entry also works when Passenger uses
// require(), while the application itself remains an ES module.
process.env.NODE_ENV = "production";
import("./app.js")
  .then(({ startWebsite }) => startWebsite())
  .then((app) => {
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close(); });
  })
  .catch((error) => {
    console.error("Unable to start Baha Turk:", error.code || error.message);
    process.exitCode = 1;
  });
