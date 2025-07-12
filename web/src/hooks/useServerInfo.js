import { useState, useEffect } from 'react';

export const useServerInfo = () => {
    const [serverInfo, setServerInfo] = useState({
        instanceId: null,
        loading: true,
        error: null
    });

    useEffect(() => {
        const fetchServerInfo = async () => {
            try {
                const response = await fetch('/api/info');
                if (!response.ok) {
                    throw new Error('Failed to fetch server info');
                }
                const data = await response.json();
                setServerInfo({
                    instanceId: data.instanceId,
                    loading: false,
                    error: null
                });
            } catch (err) {
                setServerInfo(prev => ({
                    ...prev,
                    loading: false,
                    error: err.message
                }));
            }
        };

        fetchServerInfo();
    }, []);

    return serverInfo;
};