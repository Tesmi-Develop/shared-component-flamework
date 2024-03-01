import { Selector } from "@rbxts/reflex";
import { SharedComponent } from "./source/shared-component";

export type InferSharedComponentState<T> = T extends SharedComponent<infer S> ? S : never;
export type Subscriber<S extends object, R = unknown> = {
	selector: Selector<S, R>;
	predicate?: (state: R, previousState: R) => boolean;
	callback: (state?: S, previousState?: S) => void;
};

export interface WrapSubscriber {
	OnlyServer: () => () => void;
	OnlyClient: () => () => void;
	Disconnect: () => void;
}

export interface SharedComponentInfo {
	Instance: Instance;
	Identifier: string;
	SharedIdentifier: string;
	PointerID?: string;
}
