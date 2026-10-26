// A failure the release gates raise on purpose (bad config, dishonest release, missing
// report, a report the surface diff cannot classify). The CLI entry points catch it,
// print the ::error:: annotation and exit 1; a test can catch it as a normal exception
// without the process being torn down.
class GateError extends Error {}

function fail(message) {
  throw new GateError(message);
}

export { GateError, fail };
