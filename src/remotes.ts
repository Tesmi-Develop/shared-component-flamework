import { Flamework } from "@flamework/core";
import { SyncPayload } from "@rbxts/charm-sync";
import { Client, Server, createRemotes, remote } from "@rbxts/remo";
import { PlayerAction, SharedComponentInfo } from "./types";

export const remotes = createRemotes({
	_shared_component_dispatch: remote<Client, [payload: SyncPayload<{}>, componentInfo: string]>(
		Flamework.createGuard(),
		Flamework.createGuard(),
	),

	_shared_component_remote_function_Server: remote<
		Server,
		[componentInfo: string, remoteName: string, args: unknown[]]
	>(Flamework.createGuard(), Flamework.createGuard()).returns<unknown>(),

	_shared_component_remote_event_Server: remote<Server, [componentInfo: string, eventName: string, args: unknown[]]>(
		Flamework.createGuard(),
		Flamework.createGuard(),
	),

	_shared_component_remote_event_Client: remote<Client, [componentInfo: string, eventName: string, args: unknown[]]>(
		Flamework.createGuard(),
		Flamework.createGuard(),
	),

	_shared_component_connection: remote<Server, [componentInfo: SharedComponentInfo | string, action: PlayerAction]>(
		Flamework.createGuard(),
		Flamework.createGuard(),
	).returns<[boolean, string]>(Flamework.createGuard()),

	_shared_component_disconnected: remote<Client, [componentInfo: string]>(Flamework.createGuard()),
});
