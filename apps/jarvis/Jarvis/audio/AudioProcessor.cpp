/*
 * Atoll (DynamicIsland)
 * Original work Copyright (C) 2026 ZephyrCodesStuff (https://github.com/ZephyrCodesStuff/rtaudio)
 * Modified work Copyright (C) 2026 Atoll Contributors
 *
 * Real-time audio processor using Accelerate framework for efficient RMS
 * and biquad filtering.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This file is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

#include "AudioProcessor.hpp"

#include <Accelerate/Accelerate.h>
#include <atomic>
#include <cmath>
#include <cstring>

AudioProcessor::AudioProcessor( float sr ) : sampleRate( sr )
{
    // Six biquads to cover the frequency spectrum
    setupBiquad( 0, FilterType::LowPass, 150.0f, 0.707f );
    setupBiquad( 1, FilterType::BandPass, 400.0f, 0.40f );
    setupBiquad( 2, FilterType::BandPass, 1000.0f, 0.60f );
    setupBiquad( 3, FilterType::BandPass, 2500.0f, 0.60f );
    setupBiquad( 4, FilterType::BandPass, 5000.0f, 0.85f );
    setupBiquad( 5, FilterType::HighPass, 8000.0f, 0.707f );
}

AudioProcessor::~AudioProcessor()
{
    for ( int i = 0; i < kBands; ++i )
    {
        vDSP_biquad_DestroySetup( setups[i] );
    }
}

void AudioProcessor::process( const float* __restrict__ buffer,
                              int totalSamples )
{
    if ( __builtin_expect( totalSamples <= 0, 0 ) )
    {
        return;
    }

    const float* src = buffer;
    int remaining = totalSamples;

    while ( remaining > 0 )
    {
        int toCopy = std::min( remaining, kBlockSize - writePos );
        memcpy( mono + writePos, src, toCopy * sizeof( float ) );
        writePos += toCopy;
        src += toCopy;
        remaining -= toCopy;

        if ( writePos >= kBlockSize )
        {
            processBlock();
            writePos = 0;
        }
    }
}

float AudioProcessor::getBand( int i ) const
{
    if ( __builtin_expect( i < 0 || i >= kBands, 0 ) ) return 0.0f;
    return bandParams[i].load( std::memory_order_relaxed );
}

void AudioProcessor::processBlock()
{
    for ( int i = 0; i < kBands; ++i )
    {
        vDSP_biquad( setups[i], delays[i], mono, 1, filtered, 1, kBlockSize );

        // RMS over the block — more stable than peak for driving animation
        float rms = 0.0f;
        vDSP_rmsqv( filtered, 1, &rms, kBlockSize );

        if ( __builtin_expect( !std::isfinite( rms ), 0 ) )
        {
            rms = 0.0f;
        }

        float boostedRms = rms * kGains[i];
        boostedRms = std::min( boostedRms, 1.0f );

        // Asymmetric envelope: attack fast, release slow
        float prev = envelopes[i];
        envelopes[i] = ( boostedRms > prev )
                           ? prev * ( 1.0f - kAttack ) + boostedRms * kAttack
                           : prev * ( 1.0f - kRelease ) + boostedRms * kRelease;

        bandParams[i].store( envelopes[i], std::memory_order_relaxed );
    }
}

void AudioProcessor::setupBiquad( int idx, FilterType type, float freq,
                                  float q )
{
    const double w0 = 2.0 * M_PI * freq / sampleRate;
    const double sinw = std::sin( w0 );
    const double cosw = std::cos( w0 );
    const double alpha = sinw / ( 2.0 * q );

    double b0, b1, b2;
    const double a0 = 1.0 + alpha;
    const double a1 = -2.0 * cosw;
    const double a2 = 1.0 - alpha;

    switch ( type )
    {
        case FilterType::LowPass:
            b0 = ( 1.0 - cosw ) * 0.5;
            b1 = 1.0 - cosw;
            b2 = b0;
            break;
        case FilterType::HighPass:
            b0 = ( 1.0 + cosw ) * 0.5;
            b1 = -( 1.0 + cosw );
            b2 = b0;
            break;
        case FilterType::BandPass:
            b0 = alpha;
            b1 = 0.0;
            b2 = -alpha;
            break;
    }

    const double coeffs[5] = { b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0 };
    setups[idx] = vDSP_biquad_CreateSetup( coeffs, 1 );
}
