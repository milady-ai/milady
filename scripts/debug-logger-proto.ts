
import { TrajectoryLoggerService } from "../plugins/plugin-trajectory-logger/typescript/TrajectoryLoggerService.ts";

console.log("Debugging TrajectoryLoggerService Prototype:");
const proto = TrajectoryLoggerService.prototype;
console.log(Object.getOwnPropertyNames(proto));

const instance = new TrajectoryLoggerService({} as any);
console.log("Instance keys:", Object.keys(instance));
if (typeof instance.startTrajectory === 'function') {
    console.log("startTrajectory exists on instance!");
} else {
    console.log("startTrajectory MISSING on instance!");
}
