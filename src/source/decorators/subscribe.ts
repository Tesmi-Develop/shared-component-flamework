import { Selector } from "@rbxts/reflex";
import { SharedComponent } from "../shared-component";
import { Reflect } from "@flamework/core";
import { InferSharedComponentState, Subscriber } from "../../types";
import { RunService } from "@rbxts/services";

/**
 * Subscribe to changes in the state and attach a listener.
 *
 * @param {string} side - The side of the communication ("Server" | "Client" | "Both")
 * @param {Selector<InferSharedComponentState<T>, R>} selector - The selector function
 * @param {(state: InferSharedComponentState<T>, previousState: InferSharedComponentState<T>) => void} predicate - The predicate function
 */
export const SharedSubscribe = <T extends SharedComponent<S>, S extends object, R>(
	side: "Server" | "Client" | "Both",
	selector: Selector<InferSharedComponentState<T>, R>,
	predicate?: (state: R, previousState: R) => boolean,
) => {
	return (
		target: T,
		propertyKey: string,
		descriptor: TypedPropertyDescriptor<(this: T, state?: R, previousState?: R) => void>,
	) => {
		if (side === "Server" && !RunService.IsServer()) return;
		if (side === "Client" && !RunService.IsClient()) return;

		Subscribe(selector, predicate)(target, propertyKey, descriptor);
	};
};

/**
 * Subscribe to changes in the state and attach a listener.
 *
 * @param {Selector<InferSharedComponentState<T>, R>} selector - The selector function
 * @param {(state: InferSharedComponentState<T>, previousState: InferSharedComponentState<T>) => void} predicate - The predicate function
 */
export const Subscribe = <T extends SharedComponent<S>, S extends object, R>(
	selector: Selector<InferSharedComponentState<T>, R>,
	predicate?: (state: R, previousState: R) => boolean,
) => {
	return (
		target: T,
		propertyKey: string,
		descriptor: TypedPropertyDescriptor<(this: T, state?: R, previousState?: R) => void>,
	) => {
		const originalMethod = descriptor.value;
		let subscribes = Reflect.getMetadata(target, "Subscribes") as Subscriber<InferSharedComponentState<T>, R>[];

		if (!subscribes) {
			subscribes = [];
			Reflect.defineMetadata(target, "Subscribes", subscribes);
		}

		subscribes.push({ selector, predicate, callback: originalMethod as never });
	};
};
