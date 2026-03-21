import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { PatientCase } from '../types';

interface CollaborationContextType {
    socket: Socket | null;
    isConnected: boolean;
    roomId: string | null;
    joinRoom: (roomId: string) => void;
    broadcastUpdate: (patientCase: PatientCase) => void;
    remoteUpdate: PatientCase | null;
    remoteCursors: Record<string, { x: number; y: number }>;
    updateCursor: (position: { x: number; y: number }) => void;
}

const CollaborationContext = createContext<CollaborationContextType | undefined>(undefined);

export const CollaborationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [remoteUpdate, setRemoteUpdate] = useState<PatientCase | null>(null);
    const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number; y: number }>>({});

    useEffect(() => {
        const newSocket = io(window.location.origin);
        setSocket(newSocket);

        newSocket.on('connect', () => setIsConnected(true));
        newSocket.on('disconnect', () => setIsConnected(false));

        newSocket.on('remote-case-update', (updatedCase: PatientCase) => {
            setRemoteUpdate(updatedCase);
        });

        newSocket.on('remote-cursor-move', ({ userId, position }) => {
            setRemoteCursors(prev => ({ ...prev, [userId]: position }));
        });

        return () => {
            newSocket.close();
        };
    }, []);

    const joinRoom = useCallback((id: string) => {
        if (socket) {
            socket.emit('join-room', id);
            setRoomId(id);
        }
    }, [socket]);

    const broadcastUpdate = useCallback((patientCase: PatientCase) => {
        if (socket && roomId) {
            socket.emit('case-update', { roomId, patientCase });
        }
    }, [socket, roomId]);

    const updateCursor = useCallback((position: { x: number; y: number }) => {
        if (socket && roomId) {
            socket.emit('cursor-move', { roomId, userId: socket.id, position });
        }
    }, [socket, roomId]);

    const value = React.useMemo(() => ({
        socket, isConnected, roomId, joinRoom, broadcastUpdate, 
        remoteUpdate, remoteCursors, updateCursor 
    }), [socket, isConnected, roomId, joinRoom, broadcastUpdate, remoteUpdate, remoteCursors, updateCursor]);

    return (
        <CollaborationContext.Provider value={value}>
            {children}
        </CollaborationContext.Provider>
    );
};

export const useCollaboration = () => {
    const context = useContext(CollaborationContext);
    if (!context) throw new Error('useCollaboration must be used within CollaborationProvider');
    return context;
};
