/* eslint-disable @typescript-eslint/no-explicit-any */
import { SharedComponent } from "../shared-component";

type InferSharedComponentState<T> = T extends SharedComponent<infer S> ? S : never;

export const Subscribe = <T extends SharedComponent<InferSharedComponentState<T>>, R = InferSharedComponentState<T>>(
	selector: (state: InferSharedComponentState<T>) => R = (state) => state as R,
) => {
	return (
		target: T,
		propertyKey: string,
		descriptor: TypedPropertyDescriptor<(this: T, state?: R, previousState?: R) => void>,
	) => {
		const originalMethod = descriptor.value;
		const Ttarget = target as unknown as { constructor: (self: T, ...args: unknown[]) => void } & T;
		const originalConstructor = Ttarget.constructor;

		Ttarget.constructor = function (this, ...args: unknown[]) {
			const result = originalConstructor(this as never, ...args);
			this.Subscribe(selector, (state, prev) => originalMethod(this, state, prev));

			return result;
		};
	};
};
