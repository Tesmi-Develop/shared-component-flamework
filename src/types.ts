import { SharedComponent } from "./source/shared-component";

export type InferSharedComponentState<T> = T extends SharedComponent<infer S> ? S : never;

export interface SharedComponentInfo {
	Instance: Instance;
	Identifier: string;
	SharedIdentifier: string;
	PointerID?: string;
}
