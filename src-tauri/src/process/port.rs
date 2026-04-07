use std::collections::HashSet;
use std::net::TcpListener;

pub fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

pub fn find_available_port(start: u16, used_ports: &HashSet<u16>) -> u16 {
    let mut port = start;
    while !is_port_available(port) || used_ports.contains(&port) {
        port = port.checked_add(1).expect("No available port found");
    }
    port
}
