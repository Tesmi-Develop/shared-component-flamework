import { Component } from "@flamework/components";
import { SharedComponent } from "../../source/shared-component";
import { SharedComponentNetwork, ServerToClient, ClientToServer } from "../../source/network";

interface State {
	value: number;
	a: number;
	b: number;
}

@Component()
export class ValueStorageComponent extends SharedComponent<State> {
	protected state = {
		value: 0,
		a: 1,
		b: 2,
	};
	protected remotes = {
		IncrementByServer: SharedComponentNetwork.event<ServerToClient, [amount: number]>(),
		IncrementByClient: SharedComponentNetwork.event<ClientToServer, [amount: number]>(),
		Increment: SharedComponentNetwork.action<[amount: number], void>(),
	};
}
