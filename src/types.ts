import { Selector } from "@rbxts/reflex";
import { SharedComponent } from "./source/shared-component";

export type InferSharedComponentState<T> = T extends SharedComponent<infer S> ? S : never;
export type Subscriber<T = SharedComponent<object>> = {
	selector: Selector<InferSharedComponentState<T>>;
	callback: (state?: InferSharedComponentState<T>, previousState?: InferSharedComponentState<T>) => void;
};

export interface WrapSubscriber {
	OnlyServer: () => () => void;
	OnlyClient: () => () => void;
	Disconnect: () => void;
}
