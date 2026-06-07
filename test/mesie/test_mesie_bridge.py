"""Tests for MESIE Bridge integration layer."""
import sys
import json
from pathlib import Path
import importlib.util

SRC = Path(__file__).parent.parent.parent / "src"

def load_module(module_path, module_name):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

conduit_mod = load_module(SRC / "mesie-bridge" / "conduit" / "mesie_conduit.py", "mesie_conduit")
io_mod = load_module(SRC / "mesie-bridge" / "spectral_io" / "io_manager.py", "io_manager")
adapter_mod = load_module(SRC / "mesie-bridge" / "fastapi_adapters" / "adapter.py", "adapter")

MESIEConduit = conduit_mod.MESIEConduit
SpectralChannel = conduit_mod.SpectralChannel
ConduitConfig = conduit_mod.ConduitConfig
ElementType = conduit_mod.ElementType
SpectralIOManager = io_mod.SpectralIOManager
MESIEFastAPIAdapter = adapter_mod.MESIEFastAPIAdapter


class TestMESIEConduit:
    def test_creation(self):
        c = MESIEConduit()
        assert c.get_status()["connected"] is False

    def test_connect_disconnect(self):
        c = MESIEConduit()
        c.connect()
        assert c.get_status()["connected"] is True
        c.disconnect()
        assert c.get_status()["connected"] is False

    def test_register_element(self):
        c = MESIEConduit()
        c.register_element("p1", ElementType.PROCESSOR)
        assert c.get_status()["elements_registered"] == 1

    def test_send_requires_connection(self):
        assert MESIEConduit().send(SpectralChannel.VISIBLE, "t", {"d": 1}) is None

    def test_send_success(self):
        c = MESIEConduit()
        c.connect()
        msg_id = c.send(SpectralChannel.VISIBLE, "t", {"d": 1})
        assert msg_id is not None and len(msg_id) == 16

    def test_channel_stats(self):
        c = MESIEConduit()
        c.connect()
        c.send(SpectralChannel.ULTRAVIOLET, "t1", {})
        c.send(SpectralChannel.ULTRAVIOLET, "t2", {})
        assert c.get_status()["channel_stats"]["ultraviolet"]["sent"] == 2

    def test_acknowledge(self):
        c = MESIEConduit()
        c.connect()
        mid = c.send(SpectralChannel.VISIBLE, "t", {})
        assert c.acknowledge(mid) is True
        assert c.acknowledge("no") is False

    def test_route_from_fastapi(self):
        c = MESIEConduit()
        c.connect()
        assert c.route_from_fastapi("/api/compute/task", "POST", {}) is not None

    def test_channel_determination(self):
        c = MESIEConduit()
        c.connect()
        c.route_from_fastapi("/critical/alert", "POST", {})
        assert c.get_status()["channel_stats"]["gamma"]["sent"] == 1

    def test_custom_config(self):
        cfg = ConduitConfig(mesie_endpoint="http://custom:9000", buffer_size=500)
        c = MESIEConduit(config=cfg)
        s = c.get_status()
        assert s["config"]["mesie_endpoint"] == "http://custom:9000"
        assert s["buffer_capacity"] == 500


class TestSpectralIOManager:
    def test_encode_decode(self):
        io = SpectralIOManager()
        data = {"key": "value", "number": 42}
        decoded = io.decode(io.encode(data, "ch"))
        assert decoded == data

    def test_checksum_integrity(self):
        io = SpectralIOManager()
        encoded = io.encode({"important": "data"})
        assert io.decode(encoded[:-5] + b"XXXXX") is None

    def test_batch_encoding(self):
        io = SpectralIOManager()
        items = [{"id": 1}, {"id": 2}]
        parsed = json.loads(io.encode_batch(items).decode())
        assert parsed["batch"] is True and parsed["count"] == 2

    def test_stats(self):
        io = SpectralIOManager()
        io.encode({"x": 1})
        io.encode({"x": 2})
        io.decode(io.encode({"x": 3}))
        s = io.get_stats()
        assert s["encoded"] == 3 and s["decoded"] == 1


class TestMESIEFastAPIAdapter:
    def test_creation(self):
        a = MESIEFastAPIAdapter()
        assert a.get_metrics()["route_count"] == 0

    def test_map_route(self):
        a = MESIEFastAPIAdapter()
        a.map_route("/api/*", "POST", "mesie:api")
        assert a.get_metrics()["route_count"] == 1

    def test_unmapped(self):
        assert MESIEFastAPIAdapter().process_request("/x", "GET", {})["status"] == "passthrough"

    def test_mapped_with_conduit(self):
        c = MESIEConduit()
        c.connect()
        a = MESIEFastAPIAdapter(conduit_ref=c)
        a.map_route("/api/test", "POST", "mesie:test")
        r = a.process_request("/api/test", "POST", {})
        assert r["status"] == "routed" and r["message_id"] is not None

    def test_mapped_without_conduit(self):
        a = MESIEFastAPIAdapter(conduit_ref=None)
        a.map_route("/api/test", "POST", "mesie:test")
        assert a.process_request("/api/test", "POST", {})["status"] == "failed"

    def test_metrics(self):
        c = MESIEConduit()
        c.connect()
        a = MESIEFastAPIAdapter(conduit_ref=c)
        a.map_route("/api/*", "GET", "mesie:api")
        a.process_request("/api/d", "GET", {})
        a.process_request("/api/e", "GET", {})
        assert a.get_metrics()["requests_routed"] == 2
