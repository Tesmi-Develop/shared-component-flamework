import { BroadcastAction } from "@rbxts/reflex";
import { Client, Server, createRemotes, remote } from "@rbxts/remo";
import { t } from "@rbxts/t";
import { SharedComponentInfo } from "./types";
import { Flamework } from "@flamework/core";

export const remotes = createRemotes({
	_shared_component_dispatch: remote<Client, [Actions: BroadcastAction[], componentInfo: SharedComponentInfo]>(
		Flamework.createGuard(),
		Flamework.createGuard(),
	),
	_shared_component_start: remote<Server, [instance: Instance]>(t.Instance),
	_shared_component_getInstanceId: remote<Server, [instance: Instance, metadata: string]>(
		t.Instance,
		t.string,
	).returns<string | undefined>(t.union(t.string, t.nil)),
	_shared_component_reciveInstanceId: remote<Client, [instance: Instance, metadata: string, id: string]>(
		t.Instance,
		t.string,
		t.string,
	),
	_shared_component_requestMethod: remote<Server, [instanceId: string, method: string, args: unknown[]]>(
		t.string,
		t.string,
		t.array(t.any),
	).returns<unknown>(),
});
