import { Client, Server, createRemotes, remote } from "@rbxts/remo";
import { t } from "@rbxts/t";
import { SharedComponentInfo } from "./types";
import { Flamework } from "@flamework/core";
import { Atom, SyncPayload } from "@rbxts/charm";

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

	_shared_component_start: remote<Server, [instance: Instance]>(t.Instance),

	_shared_component_component_interaction: remote<
		Client,
		[componentInfo: SharedComponentInfo, interaction: "Add" | "Remove"]
	>(Flamework.createGuard(), Flamework.createGuard()),
});
