import { Component } from "@flamework/components";
import { SharedComponent } from "../../source/shared-component";
import { CreatePointer } from "../../source/pointer";

interface State {
	value: number;
}

export const ValueStorageComponentPointer = CreatePointer("ValueStorageComponent");

@Component()
export class ValueStorageComponent extends SharedComponent<State> {
	protected state = {
		value: 0,
	};
}
