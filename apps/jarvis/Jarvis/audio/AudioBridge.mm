/*
 * Atoll (DynamicIsland)
 * Original work Copyright (C) 2026 ZephyrCodesStuff (https://github.com/ZephyrCodesStuff/rtaudio)
 * Modified work Copyright (C) 2026 Atoll Contributors
 *
 * Objective-C++ implementation bridging AudioProcessor to Swift.
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

#import "AudioBridge.h"
#import "AudioProcessor.hpp"

@implementation AudioBridge {
    AudioProcessor *processor;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        processor = new AudioProcessor();
    }
    return self;
}

- (void)processBuffer:(const float *)buffer count:(int)count {
    processor->process(buffer, count);
}

- (NSArray<NSNumber *> *)getSmoothedMagnitudes {
    int count = processor->getBandCount();
    NSMutableArray<NSNumber *> *magnitudes = [NSMutableArray arrayWithCapacity:count];
    for (int i = 0; i < count; i++) {
        [magnitudes addObject:@(processor->getBand(i))];
    }
    return magnitudes;
}

- (int)getBandCount {
    return processor->getBandCount();
}

- (void)dealloc {
    delete processor;
}

@end
