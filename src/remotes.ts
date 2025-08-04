import { Flamework } from "@flamework/core";
import { SyncPayload } from "@rbxts/charm-sync";
import { Client, Server, createRemotes, remote } from "@rbxts/remo";
import { PlayerAction, SharedComponentInfo } from "./types";

export const remotes = createRemotes({
	_shared_component_dispatch: remote<Client, [payload: SyncPayload<{}>, componentInfo: SharedComponentInfo]>(
		Flamework.createGuard(),
		Flamework.createGuard(),
	),

	_shared_component_remote_function_Server: remote<
		Server,
		[componentInfo: SharedComponentInfo, remoteName: string, args: unknown[]]
	>(Flamework.createGuard(), Flamework.createGuard()).returns<unknown>(),

	_shared_component_remote_event_Server: remote<
		Server,
		[componentInfo: SharedComponentInfo, eventName: string, args: unknown[]]
	>(Flamework.createGuard(), Flamework.createGuard()),

	_shared_component_remote_event_Client: remote<
		Client,
		[componentInfo: SharedComponentInfo, eventName: string, args: unknown[]]
	>(Flamework.createGuard(), Flamework.createGuard()),

	_shared_component_connection: remote<Server, [componentInfo: SharedComponentInfo, action: PlayerAction]>(
		Flamework.createGuard(),
		Flamework.createGuard(),
	).returns<boolean>(Flamework.createGuard()),

	_shared_component_disconnected: remote<Client, [componentInfo: SharedComponentInfo]>(Flamework.createGuard()),

	_shared_component_component_interaction: remote<
		Client,
		[componentInfo: SharedComponentInfo, interaction: "Add" | "Remove"]
	>(Flamework.createGuard(), Flamework.createGuard()),
});
