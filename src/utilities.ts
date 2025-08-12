import { Reflect } from "@flamework/core";
import { AbstractConstructor, Constructor } from "@flamework/core/out/utility";
import { HttpService, RunService } from "@rbxts/services";

interface ConstructorWithIndex extends Constructor {
	__index: object;
}

export const consolePrefix = `SharedComponets`;
const errorString = `--// [${consolePrefix}]: Caught an error in your code //--`;
const warnString = `--// [${consolePrefix}] //--`;

export const IsServer = RunService.IsServer();
export const IsClient = RunService.IsClient();

export function logError(message?: string, displayTraceback = true): never {
	return error(`\n ${errorString} \n ${message ?? ""} \n \n ${displayTraceback && debug.traceback()}`);
}

export function logWarning(message: string, displayTraceback = true) {
	warn(`\n ${warnString} \n ${message} \n ${displayTraceback && debug.traceback()}`);
}

export function logAssert<T>(condition: T, message?: string, displayTraceback = true): asserts condition {
	!condition && logError(message, displayTraceback);
}

export function GenerateID() {
	return `${HttpService.GenerateGUID(false)}-${tick()}`;
}

export function GetConstructorIdentifier(constructor: Constructor) {
	const identifier = Reflect.getOwnMetadata(constructor, "identifier") as string;
	if (identifier === undefined) {
		logWarning(
			`Component ${constructor} does not have an identifier. Check for the presence of the @Component decorator.`,
		);
		return "MissingIdentifier";
	}

	return identifier;
}

export function GetParentConstructor(ctor: AbstractConstructor) {
	const metatable = getmetatable(ctor) as { __index?: object };
	if (metatable && typeIs(metatable, "table")) {
		const parentConstructor = rawget(metatable, "__index") as AbstractConstructor;
		return parentConstructor;
	}
}

export function GetSharedComponentCtor<T>(constructor: Constructor, parent: Constructor) {
	let currentClass = constructor as ConstructorWithIndex;
	let metatable = getmetatable(currentClass) as ConstructorWithIndex;
	let result = constructor as Constructor<T>;

	while (currentClass && rawget(metatable, "__index") !== parent) {
		if (Reflect.getOwnMetadata(currentClass, "sharedComponentsFlamework:shared")) {
			return result;
		}

		currentClass = rawget(metatable, "__index") as ConstructorWithIndex;
		metatable = getmetatable(currentClass) as ConstructorWithIndex;
		result = currentClass as never;
	}

	return result;
}
