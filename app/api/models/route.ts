import { NextResponse } from 'next/server';

// This is a server-side API route that proxies requests to the backend
// This bypasses CORS issues because server-to-server requests don't have CORS restrictions

const API_BASE_URL = 'https://threedmockupbackend.onrender.com/api';

export async function GET(request: Request) {
    try {
        // Get query parameters
        const { searchParams } = new URL(request.url);
        const page = searchParams.get('page') || '1';
        const limit = searchParams.get('limit') || '20';

        // Make request to backend API
        const apiUrl = `${API_BASE_URL}/models?page=${page}&limit=${limit}`;
        console.log('Proxying request to:', apiUrl);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Backend API error:', errorText);
            return NextResponse.json(
                { error: 'Failed to fetch models from backend' },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log('Successfully fetched', data.data?.models?.length || 0, 'models');

        // Return the data with CORS headers to allow browser access
        return NextResponse.json(data, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    } catch (error) {
        console.error('Error in models proxy:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
