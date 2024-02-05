import { BroadcastAction } from "@rbxts/reflex";
import { Client, Server, createRemotes, remote } from "@rbxts/remo";
import { t } from "@rbxts/t";

export const remotes = createRemotes({
	_shared_component_dispatch: remote<Client, [Actions: BroadcastAction[]]>(
		t.array(
			t.interface({
				name: t.string,
				arguments: t.array(t.any),
			}),
		),
	),
	_shared_component_start: remote<Server, []>(),
	_shared_component_getInstanceId: remote<Server, [instance: Instance, metadata: string]>(
		t.Instance,
		t.string,
	).returns<string | undefined>(t.union(t.string, t.nil)),
	_shared_component_reciveInstanceId: remote<Client, [instance: Instance, metadata: string, id: string]>(
		t.Instance,
		t.string,
		t.string,
	),
});
