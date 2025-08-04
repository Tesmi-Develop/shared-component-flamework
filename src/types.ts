import { SharedComponent } from "./source/shared-component";

export type InferSharedComponentState<T> = T extends SharedComponent<infer S> ? S : never;

export interface SharedComponentInfo {
	ServerId: string;
	Identifier: string;
	SharedIdentifier: string;
	PointerID?: string;
}

export const enum PlayerAction {
	Connect,
	Disconnect,
}
