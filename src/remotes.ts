import { BroadcastAction } from "@rbxts/reflex";
import { Client, Server, createRemotes, remote } from "@rbxts/remo";
import { t } from "@rbxts/t";

export const remotes = createRemotes({
	_dispatch: remote<Client, [Actions: BroadcastAction[]]>(
		t.array(
			t.interface({
				name: t.string,
				arguments: t.array(t.any),
			}),
		),
	),
	_start: remote<Server, []>(),
	_getInstanceId: remote<Server, [instance: Instance, metadata: string]>(t.Instance, t.string).returns<
		string | undefined
	>(t.union(t.string, t.nil)),
	_reciveInstanceId: remote<Client, [instance: Instance, metadata: string, id: string]>(
		t.Instance,
		t.string,
		t.string,
	),
});
