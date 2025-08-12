import { Reflect } from "@flamework/core";

export function MarkHowSharedComponent() {
	return <T extends object>(target: T): T => {
		Reflect.defineMetadata(target, "sharedComponentsFlamework:shared", true);
		return target;
	};
}
