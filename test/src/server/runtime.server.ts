import { Flamework } from "@flamework/core";
import("../index");

Flamework.addPaths("test/src/server/components");
Flamework.addPaths("test/src/shared/components");
Flamework.ignite();
