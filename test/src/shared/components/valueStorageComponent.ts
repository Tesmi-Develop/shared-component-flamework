import { Component } from "@flamework/components";
import { MarkHowSharedComponent, SharedComponent } from "@rbxts/shared-components-flamework";
import { ClientToServer, ServerToClient, SharedComponentNetwork } from "../../source/network";

interface State {
	value: number;
}

@Component()
export class ValueStorageComponentAbstract extends SharedComponent<State> {
	protected state = {
		value: 0,
	};

	protected remotes = {
		ping: SharedComponentNetwork.event<ServerToClient, [value: number]>(),
		pong: SharedComponentNetwork.event<ClientToServer, [value: number]>(),
	};
}

@MarkHowSharedComponent()
@Component()
export class ValueStorageComponent extends ValueStorageComponentAbstract {}
