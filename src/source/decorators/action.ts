import { SharedComponent } from "../shared-component";

/**
 * Decorator for creating an Action inside a class producer.
 */
export const Action = () => {
	return <S, T extends SharedComponent<S>>(
		target: T,
		propertyKey: string,
		descriptor: TypedPropertyDescriptor<(this: T, ...args: unknown[]) => S>,
	) => {
		const originalMethod = descriptor.value;

		descriptor.value = function (this: T, ...args: unknown[]) {
			const result = originalMethod(this, ...args);
			this.Dispatch(result);

			return result;
		};

		return descriptor;
	};
};
